#!/usr/bin/env bash
# mem-sample.sh - memory footprint of the CoolerControl Qt app and its QtWebEngine tree.
#
# Reports PSS per process (tagged by Chromium process type) plus VRAM/GTT deduplicated by
# drm-client-id, and the largest resident anonymous arena in the renderer. RSS is printed
# too, but PSS is the number to trust: summing RSS across a Chromium process tree
# double-counts shared pages, which is what produces the inflated "1 GB" figures in bug
# reports. GPU memory matters most on integrated graphics, where VRAM is system RAM.
#
# Usage:  ./mem-sample.sh                        one sample, human readable
#         ./mem-sample.sh --csv                  one sample as a CSV row
#         ./mem-sample.sh --csv --header         emit the CSV header first
#         ./mem-sample.sh --watch 30 out.csv     sample every 30s into out.csv
#
#         STATE=open ./mem-sample.sh --csv       tag rows with a state label
#
# Notes:
#   * Two things about Chromium make the naive version of this script wrong, both handled
#     below: it rewrites argv into one space-separated blob (so cmdline does not split on
#     NUL and --type= must be parsed by splitting on spaces), and renderers are forked from
#     the zygote (so they are grandchildren of the Qt process, not children).
#   * A single DRM client is visible through several fds; counting fds multiplies VRAM.
#   * VRAM is elastic. It is reclaimed while idle, so quote it as a range, not a constant.
#   * To attribute JS-side retention, do not use this script or CDP Performance.getMetrics:
#     both report allocator capacity or unswept garbage. Use HeapProfiler.takeHeapSnapshot,
#     which forces a full GC and exposes per-node detachedness.
#
# When A/B testing a setting or a Chromium flag, three things will hand you a confident
# wrong answer. All three did, before being caught:
#
#   * Confirm the UI is actually on screen before you sample. A window showing the login
#     dialog, an "Access Denied" page, or nothing at all composites almost nothing, so it
#     measures low and reads as a win. An entire flag comparison was produced this way and
#     had to be thrown out. Assert real content (a chart or canvas present, no auth-error
#     text) and refuse to record a sample otherwise; a screenshot is what exposed it.
#   * Do not wipe the app's config/profile between runs. A fresh profile makes the web UI
#     try the default password first, which the daemon counts as a failed login. Six of
#     those trigger an exponential lockout of up to 15 minutes (see MAX_FAILED_ATTEMPTS in
#     the daemon's api/actor/auth.rs), and the rest of the series then measures a locked
#     out app. Log in once and reuse the profile.
#   * The baseline drifts several MB across a session as caches warm, so a single-run
#     difference under roughly 10 MB is noise. Re-measure the baseline between
#     configurations and compare medians of repeated samples, not one reading against one.

set -uo pipefail

find_root_pid() {
    pgrep -x coolercontrol | head -1
}

# Sums resident VRAM/GTT for a pid, one entry per unique drm-client-id. The same
# DRM client is visible through several fds; counting fds would multiply it.
gpu_for_pid() {
    local pid=$1
    local seen="" cid vram gtt f
    local total_vram=0 total_gtt=0
    for f in /proc/"${pid}"/fdinfo/*; do
        [[ -r ${f} ]] || continue
        grep -q '^drm-driver' "${f}" 2>/dev/null || continue
        cid=$(grep -m1 '^drm-client-id' "${f}" 2>/dev/null | awk '{print $2}')
        [[ -n ${cid} ]] || continue
        case " ${seen} " in
        *" ${cid} "*) continue ;;
        *) ;;
        esac
        seen="${seen} ${cid}"
        vram=$(grep -m1 '^drm-resident-vram' "${f}" 2>/dev/null | awk '{print $2}')
        gtt=$(grep -m1 '^drm-resident-gtt' "${f}" 2>/dev/null | awk '{print $2}')
        total_vram=$((total_vram + ${vram:-0}))
        total_gtt=$((total_gtt + ${gtt:-0}))
    done
    echo "${total_vram} ${total_gtt}"
}

# Chromium rewrites its argv into one contiguous space-separated string, so
# cmdline does not split on NUL the way a normal process does. Split on spaces.
proc_type() {
    local pid=$1 t
    t=$(tr '\0' ' ' </proc/"${pid}"/cmdline 2>/dev/null | grep -o -- '--type=[a-z-]*' | head -1)
    echo "${t#--type=}" | grep -q . && echo "${t#--type=}" || echo browser
}

# Renderers are forked from the zygote, so they are grandchildren of the Qt
# process (root -> zygote -> zygote -> renderer). Walk the tree, not just PPID.
collect() {
    local pid=$1 child
    echo "${pid}"
    for child in $(pgrep -P "${pid}" 2>/dev/null); do
        collect "${child}"
    done
}

sample() {
    local root pid pss rss vram gtt threads type
    root=$(find_root_pid)
    if [[ -z ${root} ]]; then
        echo "coolercontrol is not running" >&2
        return 1
    fi

    local sum_pss=0 sum_rss=0 sum_vram=0 sum_gtt=0 sum_threads=0
    local r_pss=0 b_pss=0 z_pss=0
    local rows=""

    for pid in $(collect "${root}" | sort -un); do
        [[ -d /proc/"${pid}" ]] || continue
        pss=$(awk '/^Pss:/{s+=$2} END{print s+0}' /proc/"${pid}"/smaps_rollup 2>/dev/null)
        rss=$(awk '/^Rss:/{s+=$2} END{print s+0}' /proc/"${pid}"/smaps_rollup 2>/dev/null)
        local gpu_line
        gpu_line=$(gpu_for_pid "${pid}")
        read -r vram gtt <<<"${gpu_line}"
        threads=$(find /proc/"${pid}"/task -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        type=$(proc_type "${pid}")

        rows+=$(printf '  %-10s pid=%-8s pss=%6d MB  rss=%6d MB  vram=%5d MB  gtt=%4d MB  threads=%d\n' \
            "${type}" "${pid}" $((pss / 1024)) $((rss / 1024)) $((vram / 1024)) $((gtt / 1024)) "${threads}")
        rows+=$'\n'

        sum_pss=$((sum_pss + pss))
        sum_rss=$((sum_rss + rss))
        sum_vram=$((sum_vram + vram))
        sum_gtt=$((sum_gtt + gtt))
        sum_threads=$((sum_threads + threads))
        case "${type}" in
        renderer) r_pss=$((r_pss + pss)) ;;
        browser) b_pss=$((b_pss + pss)) ;;
        zygote) z_pss=$((z_pss + pss)) ;;
        *) ;;
        esac
    done

    # Largest fully-resident anon arena in the renderer: the allocator region that
    # dominates the footprint. Tracking it separately shows whether growth is in the
    # JS/Blink arena or somewhere else.
    local arena=0 rpid="" ptype
    for pid in $(collect "${root}" | sort -un); do
        ptype=$(proc_type "${pid}")
        if [[ ${ptype} == renderer ]]; then
            rpid=${pid}
            break
        fi
    done
    if [[ -n ${rpid} ]] && [[ -r /proc/"${rpid}"/smaps ]]; then
        arena=$(awk '/^[0-9a-f]+-[0-9a-f]+ /{n=$6} /^Rss:/{if(n==""&&$2>a)a=$2} END{print a+0}' \
            /proc/"${rpid}"/smaps)
    fi

    local uptime_s=0
    uptime_s=$(ps -o etimes= -p "${root}" 2>/dev/null | tr -d ' ')

    local ts
    ts=$(date -Is)
    if [[ ${CSV:-0} == 1 ]]; then
        printf '%s,%s,%d,%d,%d,%d,%d,%d,%d,%d,%d\n' \
            "${ts}" "${STATE:-unknown}" "${uptime_s:-0}" \
            $((sum_pss / 1024)) $((sum_vram / 1024)) $((sum_gtt / 1024)) \
            $((b_pss / 1024)) $((r_pss / 1024)) $((z_pss / 1024)) \
            $((arena / 1024)) "${sum_threads}"
    else
        echo "coolercontrol pid=${root}  uptime=$((${uptime_s:-0} / 3600))h$(((${uptime_s:-0} % 3600) / 60))m  state=${STATE:-unknown}"
        printf '%s' "${rows}"
        printf '  %-10s        pss=%6d MB  rss=%6d MB  vram=%5d MB  gtt=%4d MB  threads=%d\n' \
            TOTAL $((sum_pss / 1024)) $((sum_rss / 1024)) $((sum_vram / 1024)) $((sum_gtt / 1024)) "${sum_threads}"
        printf '  footprint (pss+vram+gtt) = %d MB\n' $(((sum_pss + sum_vram + sum_gtt) / 1024))
        printf '  largest renderer anon arena = %d MB\n' $((arena / 1024))
    fi
}

case "${1-}" in
--csv)
    CSV=1
    [[ ${2-} == --header ]] &&
        echo "timestamp,state,uptime_s,total_pss_mb,vram_mb,gtt_mb,browser_pss_mb,renderer_pss_mb,zygote_pss_mb,renderer_arena_mb,threads"
    sample
    ;;
--watch)
    interval=${2:-30}
    out=${3:-mem-samples.csv}
    [[ -f ${out} ]] || echo "timestamp,state,uptime_s,total_pss_mb,vram_mb,gtt_mb,browser_pss_mb,renderer_pss_mb,zygote_pss_mb,renderer_arena_mb,threads" >"${out}"
    echo "sampling every ${interval}s into ${out} (ctrl-c to stop)"
    while true; do
        CSV=1 sample >>"${out}"
        sleep "${interval}"
    done
    ;;
*)
    sample
    ;;
esac
