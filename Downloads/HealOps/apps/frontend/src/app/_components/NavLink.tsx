'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { forwardRef } from 'react';
import { cn } from '@/libs/utils/cn';

const NavLink = forwardRef<
  HTMLAnchorElement,
  {
    href: string;
    className?: string;
    activeClassName?: string;
    pendingClassName?: string;
    children?: React.ReactNode;
    [key: string]: any;
  }
>(
  (
    {
      className,
      activeClassName,
      pendingClassName,
      href,
      children,
      ...props
    },
    ref
  ) => {
    const pathname = usePathname();
    const isActive = pathname === href;
    const isPending = false;

    return (
      <Link
        ref={ref}
        href={href}
        className={cn(
          className,
          isActive && activeClassName,
          isPending && pendingClassName
        )}
        {...props}
      >
        {children}
      </Link>
    );
  }
);

NavLink.displayName = 'NavLink';

export { NavLink };
