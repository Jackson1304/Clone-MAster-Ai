import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  icon, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1e1e1e]";
  
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500",
    secondary: "bg-[#333] hover:bg-[#444] text-white focus:ring-gray-500 border border-[#555]",
    danger: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500",
    ghost: "bg-transparent hover:bg-[#333] text-gray-300 hover:text-white"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      {...props}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      {children}
    </button>
  );
};
