export default {
    root: 'relative flex',
    content:
        'overflow-x-auto overflow-y-hidden scroll-smooth overscroll-x-contain overscroll-y-auto [&::-webkit-scrollbar]:hidden grow',
    tabList: 'relative flex border-border-one border-none',
    nextButton:
        '!absolute top-0 right-0 z-20 h-full w-10 flex items-center justify-center text-surface-700 bg-surface-0 outline-transparent cursor-pointer shrink-0',
    prevButton:
        '!absolute top-0 left-0 z-20 h-full w-10 flex items-center justify-center text-surface-700 bg-surface-0 outline-transparent cursor-pointer shrink-0',
    activeBar: 'z-10 block absolute h-0 bottom-0',
}
