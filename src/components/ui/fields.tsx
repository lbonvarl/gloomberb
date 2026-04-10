import { useEffect, useRef, useState, type RefObject } from "react";
import type { InputRenderable } from "@opentui/core";
import { colors } from "../../theme/colors";

export interface TextFieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  focused?: boolean;
  width?: number;
  inputRef?: RefObject<InputRenderable | null>;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  hint?: string;
  type?: "text" | "password";
  backgroundColor?: string;
  textColor?: string;
  placeholderColor?: string;
  onMouseDown?: () => void;
  showDisplayOverlay?: boolean;
}

const PASSWORD_MASK_CHAR = "*";

function maskPassword(value: string): string {
  return PASSWORD_MASK_CHAR.repeat(value.length);
}

export function TextField({
  label,
  value,
  placeholder,
  focused,
  width,
  inputRef,
  onChange,
  onSubmit,
  hint,
  type = "text",
  backgroundColor = colors.bg,
  textColor = colors.text,
  placeholderColor = colors.textDim,
  onMouseDown,
  showDisplayOverlay = false,
}: TextFieldProps) {
  const localInputRef = useRef<InputRenderable>(null);
  const resolvedInputRef = inputRef ?? localInputRef;
  const currentValueRef = useRef(value ?? "");
  const [cursorOffset, setCursorOffset] = useState((value ?? "").length);
  const isPassword = type === "password";
  const useOverlay = isPassword || showDisplayOverlay;
  const currentValue = value ?? "";
  const maskedValue = maskPassword(currentValue);
  const displayValue = isPassword ? maskedValue : currentValue;
  const placeholderDisplay = focused ? "" : (placeholder ?? "");
  const visibleDisplay = displayValue.length > 0 ? displayValue : placeholderDisplay;
  const visibleTextColor = displayValue.length > 0 || focused ? textColor : placeholderColor;

  useEffect(() => {
    currentValueRef.current = currentValue;
    setCursorOffset(resolvedInputRef.current?.cursorOffset ?? currentValue.length);
  }, [currentValue, resolvedInputRef]);

  const syncCursorOffset = (fallbackValue = currentValueRef.current) => {
    setCursorOffset(resolvedInputRef.current?.cursorOffset ?? fallbackValue.length);
  };

  const visibleCursorOffset = currentValue.length > 0
    ? Math.max(0, Math.min(cursorOffset, currentValue.length))
    : 0;
  const visibleBefore = visibleDisplay.slice(0, visibleCursorOffset);
  const visibleCursorChar = visibleDisplay[visibleCursorOffset] ?? " ";
  const visibleAfter = visibleDisplay.slice(visibleCursorOffset + (visibleCursorOffset < visibleDisplay.length ? 1 : 0));

  return (
    <box flexDirection="column">
      {label && (
        <box height={1}>
          <text fg={placeholderColor}>{label}</text>
        </box>
      )}
      <box height={1} onMouseDown={() => {
        onMouseDown?.();
        resolvedInputRef.current?.focus?.();
      }}>
        <input
          ref={resolvedInputRef}
          width={width}
          value={value}
          selectable={!useOverlay}
          placeholder={useOverlay ? "" : placeholder}
          focused={focused}
          textColor={useOverlay ? backgroundColor : textColor}
          placeholderColor={placeholderColor}
          backgroundColor={backgroundColor}
          selectionBg={useOverlay ? backgroundColor : undefined}
          selectionFg={useOverlay ? backgroundColor : undefined}
          showCursor={!useOverlay}
          onCursorChange={() => syncCursorOffset()}
          onInput={(nextValue) => {
            currentValueRef.current = nextValue;
            syncCursorOffset(nextValue);
            onChange?.(nextValue);
          }}
          onChange={(nextValue) => {
            currentValueRef.current = nextValue;
            syncCursorOffset(nextValue);
            onChange?.(nextValue);
          }}
          onSubmit={() => onSubmit?.(currentValueRef.current)}
        />
        {useOverlay && (
          <box
            position="absolute"
            left={0}
            top={0}
            height={1}
            width={width}
            onMouseDown={() => {
              onMouseDown?.();
              resolvedInputRef.current?.focus?.();
            }}
          >
            <text fg={visibleTextColor} selectable={false}>
              {visibleBefore}
              {focused && (
                <span bg={visibleTextColor} fg={backgroundColor}>{visibleCursorChar}</span>
              )}
              {focused ? visibleAfter : visibleDisplay.slice(visibleBefore.length)}
            </text>
          </box>
        )}
      </box>
      {hint && (
        <box height={1}>
          <text fg={colors.textMuted}>{hint}</text>
        </box>
      )}
    </box>
  );
}

export interface SearchFieldProps extends Omit<TextFieldProps, "label"> {
  label?: string;
}

export function SearchField({
  label = "Search",
  hint = "Type to filter",
  ...props
}: SearchFieldProps) {
  return <TextField label={label} hint={hint} placeholder={props.placeholder ?? "Search..."} {...props} />;
}

function sanitizeNumberInput(value: string, allowDecimal: boolean, allowNegative: boolean): string {
  const allowed = allowDecimal ? /[0-9.-]/g : /[0-9-]/g;
  let next = (value.match(allowed) ?? []).join("");

  if (!allowNegative) next = next.replace(/-/g, "");
  if (allowNegative) next = next.replace(/(?!^)-/g, "");

  if (allowDecimal) {
    const [whole, ...rest] = next.split(".");
    next = rest.length === 0 ? next : `${whole}.${rest.join("")}`;
  } else {
    next = next.replace(/\./g, "");
  }

  return next;
}

export interface NumberFieldProps extends Omit<TextFieldProps, "onChange" | "onSubmit"> {
  allowDecimal?: boolean;
  allowNegative?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
}

export function NumberField({
  allowDecimal = true,
  allowNegative = false,
  onChange,
  onSubmit,
  ...props
}: NumberFieldProps) {
  return (
    <TextField
      {...props}
      onChange={(nextValue) => onChange?.(sanitizeNumberInput(nextValue, allowDecimal, allowNegative))}
      onSubmit={(nextValue) => onSubmit?.(sanitizeNumberInput(nextValue, allowDecimal, allowNegative))}
    />
  );
}
