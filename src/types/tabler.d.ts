// Tabler's bundled JS (Bootstrap's components included) ships no types. Only what the app uses
// is declared. Import it from this same path as `main.tsx` does, so Bootstrap is loaded once.
declare module '@tabler/core/dist/js/tabler.min.js' {
  interface PopoverOptions {
    trigger?: string;
    placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
    html?: boolean;
    content?: string | Element | (() => string | Element);
    delay?: number | { show: number; hide: number };
  }

  interface Popover {
    dispose(): void;
  }

  const tabler: { Popover: new (element: Element, options?: PopoverOptions) => Popover };
  export default tabler;
}
