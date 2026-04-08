import clsx from 'clsx';

export default function cn(...classes: (string | undefined | null | false)[]): string {
  return clsx(classes);
}
