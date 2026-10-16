"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

type SelectOptionGroup = {
  label: React.ReactNode;
  options: SelectOption[];
};

type OptionEntry = SelectOption | SelectOptionGroup;

const EMPTY_VALUE = "__worksync_empty_option__";

function getText(value: React.ReactNode): string {
  return React.Children.toArray(value)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (React.isValidElement(child)) return getText((child.props as { children?: React.ReactNode }).children);
      return "";
    })
    .join("");
}

function parseOptions(children: React.ReactNode): OptionEntry[] {
  return React.Children.toArray(children).flatMap((child): OptionEntry[] => {
    if (!React.isValidElement(child)) return [];
    const props = child.props as {
      value?: string | number;
      label?: string;
      disabled?: boolean;
      children?: React.ReactNode;
    };

    if (child.type === React.Fragment) return parseOptions(props.children);
    if (child.type === "optgroup") {
      return [{ label: props.label ?? "", options: parseOptions(props.children).flatMap((entry) => "options" in entry ? entry.options : [entry]) }];
    }
    if (child.type !== "option") return [];

    const label = props.children;
    return [{
      value: String(props.value ?? getText(label)),
      label,
      disabled: props.disabled,
    }];
  });
}

type SelectAttributes = Pick<React.ComponentProps<"select">, "children" | "className" | "value" | "defaultValue" | "disabled" | "required" | "name" | "id" | "form" | "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid" | "title" | "style" | "tabIndex" | "onBlur" | "onFocus" | "onKeyDown" | "onKeyUp" | "onPointerDown" | "onPointerUp">;
export type StyledSelectProps = SelectAttributes & {
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
};

export function StyledSelect({
  children,
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  form,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  title,
  style,
  tabIndex,
  onBlur,
  onFocus,
  onKeyDown,
  onKeyUp,
  onPointerDown,
  onPointerUp,
  ...ariaProps
}: StyledSelectProps) {
  const options = React.useMemo(() => parseOptions(children), [children]);
  const [uncontrolledValue, setUncontrolledValue] = React.useState(String(defaultValue ?? ""));
  const selectedValue = String(value ?? (value === undefined ? uncontrolledValue : ""));
  const internalValue = selectedValue === "" ? EMPTY_VALUE : selectedValue;
  const nativeValue = selectedValue;
  const heightToken = className?.split(/\s+/).find((token) => /^!?h-\d+(?:\.\d+)?$/.test(token));
  const triggerStyle = {
    ...style,
    height: style?.height ?? `${Number(heightToken?.replace(/^!?h-/, "") ?? 10) * 4}px`,
  };

  const handleValueChange = (nextInternalValue: string) => {
    const nextValue = nextInternalValue === EMPTY_VALUE ? "" : nextInternalValue;
    if (value === undefined) setUncontrolledValue(nextValue);
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as unknown as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <>
      {name && <input type="hidden" name={name} form={form} value={nativeValue} />}
      <Select value={internalValue} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className={cn("h-10 w-full rounded-md border-input bg-background px-3 text-sm", className)}
          style={triggerStyle}
          title={title}
          tabIndex={tabIndex}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-required={required || undefined}
          {...ariaProps}
          onBlur={onBlur as React.FocusEventHandler<HTMLButtonElement> | undefined}
          onFocus={onFocus as React.FocusEventHandler<HTMLButtonElement> | undefined}
          onKeyDown={onKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined}
          onKeyUp={onKeyUp as React.KeyboardEventHandler<HTMLButtonElement> | undefined}
          onPointerDown={onPointerDown as React.PointerEventHandler<HTMLButtonElement> | undefined}
          onPointerUp={onPointerUp as React.PointerEventHandler<HTMLButtonElement> | undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" sideOffset={4} avoidCollisions={false} className="rounded-lg border bg-popover p-1 shadow-md">
          {options.map((entry, index) => "options" in entry ? (
            <SelectGroup key={`group-${index}`}>
              {entry.label && <SelectLabel>{entry.label}</SelectLabel>}
              {entry.options.map((option) => (
                <SelectItem key={option.value} value={option.value === "" ? EMPTY_VALUE : option.value} disabled={option.disabled} className="rounded-md">
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            <SelectItem key={`${entry.value}-${index}`} value={entry.value === "" ? EMPTY_VALUE : entry.value} disabled={entry.disabled} className="rounded-md">
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
