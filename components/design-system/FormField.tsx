'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

export interface FormFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  id: string;
  helpText?: string;
  errorText?: string;
}

const FORM_FIELD_STYLES = `
[data-bos-field] {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 320px;
}
[data-bos-field-label] {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bos-color-ink-tertiary);
}
[data-bos-field-input] {
  background: var(--bos-color-surface-base);
  border: 1px solid var(--bos-color-border-subtle);
  border-radius: var(--bos-radius-md);
  padding: 10px 12px;
  color: var(--bos-color-ink-primary);
  font-size: 13px;
  line-height: 1.4;
  font-family: inherit;
  transition: border-color var(--bos-motion-duration-fast) var(--bos-motion-easing-out),
              box-shadow var(--bos-motion-duration-fast) var(--bos-motion-easing-out);
}
[data-bos-field-input]:focus {
  outline: none;
  border-color: var(--bos-color-brand-primary);
  box-shadow: 0 0 0 3px var(--bos-color-brand-primary-glow);
}
[data-bos-field][data-error="true"] [data-bos-field-input] {
  border-color: var(--bos-color-semantic-error);
}
[data-bos-field][data-error="true"] [data-bos-field-input]:focus {
  box-shadow: 0 0 0 3px var(--bos-color-semantic-error-glow);
}
[data-bos-field-help] {
  font-size: 12px;
  color: var(--bos-color-ink-tertiary);
}
[data-bos-field-error] {
  font-size: 12px;
  color: var(--bos-color-semantic-error);
  font-weight: 600;
}
`;

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, id, helpText, errorText, style, ...rest },
  ref,
) {
  const hasError = Boolean(errorText);
  // Help text is suppressed in render when an error is present, so aria-describedby
  // must mirror that — point only at the message that actually exists in the DOM.
  const describedBy = hasError
    ? `${id}-error`
    : helpText
      ? `${id}-help`
      : undefined;

  return (
    <>
      <style href="bos-field" precedence="low">{FORM_FIELD_STYLES}</style>
      <div data-bos-field="" data-error={hasError ? 'true' : 'false'} style={style}>
        <label data-bos-field-label="" htmlFor={id}>
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          data-bos-field-input=""
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {errorText ? (
          <span id={`${id}-error`} data-bos-field-error="" role="alert">
            {errorText}
          </span>
        ) : helpText ? (
          <span id={`${id}-help`} data-bos-field-help="">
            {helpText}
          </span>
        ) : null}
      </div>
    </>
  );
});
