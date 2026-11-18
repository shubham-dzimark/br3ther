import { Field, fieldInput } from "@/components/admin/Field";

/* Small form rows shared by the Header and Footer pages. */

/** A switch row: checkbox, title, and a line of explanation. */
export function Toggle({
  name,
  checked,
  title,
  hint,
}: {
  name: string;
  checked: boolean;
  title: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
      />
      <span className="text-sm text-slate-700">
        {title}
        {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

/** A plain text field with the built-in wording as its placeholder. */
export function TextField({
  name,
  label,
  value,
  placeholder,
  hint,
  type = "text",
}: {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        className={fieldInput}
      />
    </Field>
  );
}
