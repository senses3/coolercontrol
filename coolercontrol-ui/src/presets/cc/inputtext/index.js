export default {
    root: ({ props, context, parent }) => ({
        class: [
            // Font
            'leading-[normal]',

            // Flex
            { 'flex-1 w-[1%]': parent.instance.$name == 'InputGroup' },

            // Spacing
            'm-0',
            { 'w-full': props.fluid },

            // Size
            {
                'px-4 py-4': props.size == 'large',
                'px-2 py-2': props.size == 'small',
                'p-2': props.size == null,
            },

            // Shape
            { 'rounded-lg': parent.instance.$name !== 'InputGroup' },
            {
                'first:rounded-l-md rounded-none last:rounded-r-md':
                    parent.instance.$name == 'InputGroup',
            },
            { 'border-0 border-y border-l last:border-r': parent.instance.$name == 'InputGroup' },
            { 'first:ml-0 -ml-px': parent.instance.$name == 'InputGroup' && !props.showButtons },

            // Colors
            'text-text-color',
            'placeholder:text-text-color-secondary',
            'bg-bg-one',
            'border-2',
            { 'border-border-one': !props.invalid },

            // Invalid State
            'invalid:focus:ring-red-200',
            'invalid:hover:border-red',
            { 'border-red': props.invalid },

            // States
            {
                // 'hover:border-primary': !context.disabled && !props.invalid,
                'focus:outline-none focus:outline-offset-0 focus:ring focus:ring-primary-500/50 focus:z-10':
                    !context.disabled,
                'opacity-60 select-none pointer-events-none cursor-default': context.disabled,
            },

            // Filled State *for FloatLabel
            { filled: parent.instance?.$name == 'FloatLabel' && context.filled },

            // Misc
            'appearance-none',
            'transition-colors duration-200',
        ],
    }),
}
