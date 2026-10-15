import React from 'react';

interface VerifiedBadgeProps {
  size?: number;
  className?: string;
  showTooltip?: boolean;
}

/**
 * Reusable Instagram-inspired Verification Badge.
 * Features a solid vibrant blue 12-lobed scalloped rosette seal
 * with a crisp white centered checkmark.
 */
export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = 16,
  className = '',
  showTooltip = true,
}) => {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 align-middle ${className}`}
      title={showTooltip ? 'Verified Account' : undefined}
      role="img"
      aria-label="Verified Account"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 overflow-visible"
      >
        {/* 12-lobed scalloped rosette seal background in authentic Instagram-style electric blue */}
        <path
          d="M12 2C13.06 2 14.07 2.5 14.74 3.32L15.42 4.15C16.15 5.04 17.26 5.51 18.4 5.38L19.45 5.27C20.69 5.13 21.84 5.95 22.09 7.18L22.31 8.23C22.55 9.38 23.27 10.35 24.28 10.87L25.21 11.35C26.31 11.92 26.83 13.22 26.41 14.39L26.05 15.39C25.66 16.48 25.8 17.69 26.43 18.66L27.01 19.55"
          fill="none"
        />
        {/* Standardized 24x24 viewBox symmetrical 12-point scalloped seal */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 1.5C12.87 1.5 13.67 1.95 14.13 2.68L14.7 3.59C15.19 4.37 16.07 4.88 17 4.92L18.08 4.97C19.14 5.02 20.03 5.76 20.25 6.8L20.47 7.86C20.67 8.78 21.32 9.53 22.2 9.87L23.23 10.26C24.24 10.64 24.89 11.62 24.81 12.69L24.73 13.77C24.66 14.7 25.07 15.61 25.83 16.19L26.71 16.86C27.57 17.52 27.87 18.67 27.43 19.66L26.98 20.67C26.59 21.54 26.68 22.56 27.22 23.35"
          fill="none"
        />
        {/* Precise 24x24 Instagram-grade Rosette Path */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10.521 2.623a2.034 2.034 0 012.958 0l.968.995a2.034 2.034 0 001.693.593l1.378-.17a2.034 2.034 0 012.28 1.884l.095 1.385a2.034 2.034 0 00.99 1.5l1.22.68a2.034 2.034 0 011.08 2.766l-.59 1.258a2.034 2.034 0 000 1.794l.59 1.258a2.034 2.034 0 01-1.08 2.766l-1.22.68a2.034 2.034 0 00-.99 1.5l-.095 1.385a2.034 2.034 0 01-2.28 1.884l-1.378-.17a2.034 2.034 0 00-1.693.593l-.968.995a2.034 2.034 0 01-2.958 0l-.968-.995a2.034 2.034 0 00-1.693-.593l-1.378.17a2.034 2.034 0 01-2.28-1.884l-.095-1.385a2.034 2.034 0 00-.99-1.5l-1.22-.68a2.034 2.034 0 01-1.08-2.766l.59-1.258a2.034 2.034 0 000-1.794l-.59-1.258a2.034 2.034 0 011.08-2.766l1.22-.68a2.034 2.034 0 00.99-1.5l.095-1.385a2.034 2.034 0 012.28-1.884l1.378.17a2.034 2.034 0 001.693-.593l.968-.995z"
          fill="#0095F6"
        />
        {/* Crisp solid white checkmark */}
        <path
          d="M7.75 12.25L10.5 15L16.25 9.25"
          stroke="#FFFFFF"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

export default VerifiedBadge;
