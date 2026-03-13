import { type ReactNode } from 'react';

interface SectionWrapperProps {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: 'section' | 'div';
}

export default function SectionWrapper({
  children,
  className = '',
  id,
  as: Tag = 'section',
}: SectionWrapperProps) {
  return (
    <Tag id={id} className={`mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24 ${className}`}>
      {children}
    </Tag>
  );
}
