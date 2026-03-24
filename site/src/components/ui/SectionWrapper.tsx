import { type ReactNode } from 'react';

interface SectionWrapperProps {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: 'section' | 'div';
  variant?: 'dark' | 'light';
}

export default function SectionWrapper({
  children,
  className = '',
  id,
  as: Tag = 'section',
  variant,
}: SectionWrapperProps) {
  if (variant) {
    const isLight = variant === 'light';
    return (
      <div className={`${isLight ? 'section-light' : 'section-dark'} relative`}>
        <div className={`${isLight ? 'grid-bg grid-bg-light' : 'grid-bg grid-bg-dark'}`} style={{
          maskImage: 'linear-gradient(to bottom, black 0%, black 80%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 80%, transparent 100%)',
        }} />
        <Tag id={id} className={`relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32 ${className}`}>
          {children}
        </Tag>
      </div>
    );
  }

  return (
    <Tag id={id} className={`mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32 ${className}`}>
      {children}
    </Tag>
  );
}
