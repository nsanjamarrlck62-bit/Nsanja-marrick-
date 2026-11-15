import React, { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  name: string;
  sizeClass?: string;
  fallbackIcon?: React.ReactNode;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  sizeClass = 'w-9 h-9',
  fallbackIcon,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeClass} rounded-full object-cover border border-white/[0.08] shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${sizeClass} rounded-full bg-gradient-to-br from-[#192433] to-[#111722] border border-white/[0.1] flex items-center justify-center text-xs font-semibold text-emerald-300 shrink-0 select-none ${className}`}
    >
      {fallbackIcon || initials || 'K'}
    </div>
  );
};
