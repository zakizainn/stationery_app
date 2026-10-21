"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";

type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

export function PasswordInput({ className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative block">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={visible}
        title={visible ? "Sembunyikan password" : "Tampilkan password"}
        className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        {visible ? <EyeSlash size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </span>
  );
}
