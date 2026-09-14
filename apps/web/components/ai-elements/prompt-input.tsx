"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  type FormEvent,
  type TextareaHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, CircleNotch, Sparkle } from "@phosphor-icons/react";


// Context

interface PromptInputContextType {
  value: string;
  setValue: (v: string) => void;
  isSubmitting: boolean;
  onSubmit: (text: string) => void | Promise<void>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

const PromptInputContext = createContext<PromptInputContextType | null>(null);

export function usePromptInput() {
  const ctx = useContext(PromptInputContext);
  if (!ctx) {
    throw new Error("usePromptInput must be used within a PromptInput");
  }
  return ctx;
}


// Main PromptInput Form Component

export interface PromptInputProps
  extends Omit<HTMLAttributes<HTMLFormElement>, "onSubmit"> {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  onSubmit?: (text: string) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function PromptInput({
  className,
  value: controlledValue,
  onValueChange,
  defaultValue = "",
  onSubmit,
  isSubmitting = false,
  children,
  ...props
}: PromptInputProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = useCallback(
    (newValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [isControlled, onValueChange]
  );

  const triggerSubmit = useCallback(
    async (textToSubmit?: string) => {
      const text = (typeof textToSubmit === "string" ? textToSubmit : currentValue).trim();
      if (!text || isSubmitting) return;

      if (onSubmit) {
        await onSubmit(text);
      }
      if (!isControlled) {
        setUncontrolledValue("");
      } else {
        onValueChange?.("");
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [currentValue, isSubmitting, onSubmit, isControlled, onValueChange]
  );

  const handleFormSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      triggerSubmit();
    },
    [triggerSubmit]
  );

  return (
    <PromptInputContext.Provider
      value={{
        value: currentValue,
        setValue: handleValueChange,
        isSubmitting,
        onSubmit: triggerSubmit,
        textareaRef,
      }}
    >
      <form
        onSubmit={handleFormSubmit}
        className={cn(
          "group relative flex w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800/90 bg-white/95 dark:bg-zinc-950/90 p-3.5 text-zinc-900 dark:text-zinc-100 shadow-2xl backdrop-blur-xl transition-all duration-200 focus-within:border-zinc-400 dark:focus-within:border-zinc-600/90 focus-within:ring-2 focus-within:ring-zinc-300/60 dark:focus-within:ring-zinc-800/60",
          className
        )}
        {...props}
      >
        {children}
      </form>
    </PromptInputContext.Provider>
  );
}


// PromptInputBody

export function PromptInputBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative flex min-h-[52px] w-full flex-col", className)}
      {...props}
    />
  );
}


// PromptInputTextarea


export interface PromptInputTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minHeight?: number;
  maxHeight?: number;
}

export function PromptInputTextarea({
  className,
  placeholder = "Ask anything about company products, pricing, or locations...",
  minHeight = 48,
  maxHeight = 240,
  onKeyDown,
  ...props
}: PromptInputTextareaProps) {
  const { value, setValue, onSubmit, isSubmitting, textareaRef } = usePromptInput();

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${newHeight}px`;
  }, [minHeight, maxHeight, textareaRef]);

  useEffect(() => {
    handleInput();
  }, [value, handleInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(value);
    }
  };

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      rows={1}
      placeholder={placeholder}
      disabled={isSubmitting}
      className={cn(
        "w-full resize-none bg-transparent px-1.5 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}


// PromptInputFooter & PromptInputActions

export function PromptInputFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-2 flex items-center justify-between gap-2 border-t border-zinc-200 dark:border-zinc-900/80 pt-2.5",
        className
      )}
      {...props}
    />
  );
}

export const PromptInputActions = PromptInputFooter;


// PromptInputTools (Left Toolbar)

export function PromptInputTools({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400", className)}
      {...props}
    />
  );
}


// PromptInputAction Button

export interface PromptInputActionProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function PromptInputAction({
  className,
  active = false,
  children,
  ...props
}: PromptInputActionProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
          : "border-zinc-200 dark:border-zinc-800/80 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-200",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}


// PromptInputBadge / Filter Tool

export function PromptInputBadge({
  icon: Icon = Sparkle,
  label,
  className,
}: {
  icon?: React.ComponentType<{ className?: string; size?: number | string; weight?: any }>;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100 dark:bg-zinc-900/60 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-400 select-none",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
      <span>{label}</span>
    </div>
  );
}


// PromptInputSubmit Button

export interface PromptInputSubmitProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  status?: "idle" | "submitted" | "streaming" | "error";
}

export function PromptInputSubmit({
  className,
  status = "idle",
  disabled,
  children,
  ...props
}: PromptInputSubmitProps) {
  const { value, isSubmitting } = usePromptInput();
  const isDisabled = disabled || isSubmitting || !value.trim();

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-label="Submit prompt"
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-950 transition-all hover:bg-zinc-800 dark:hover:bg-white active:scale-95 disabled:pointer-events-none disabled:opacity-30",
        className
      )}
      {...props}
    >
      {isSubmitting ? (
        <CircleNotch className="h-4 w-4 animate-spin" />
      ) : children ? (
        children
      ) : (
        <ArrowUp className="h-4 w-4" weight="bold" />
      )}
    </button>
  );
}
