declare global {
  interface Window {
    api: {
      send: (channel: string, ...args: any[]) => void;
      on: (channel: string, func: (...args: any[]) => void) => void;
      once: (channel: string, func: (...args: any[]) => void) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
  interface SidebarProps {
    sidebarPosition: 'left' | 'right';
    children?: (args: {
      hidden: boolean;
      size: number;
      setHidden: (h: boolean) => void;
      setSize: (s: number) => void;
    }) => React.ReactNode;
  }
}

export {};
