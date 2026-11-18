"use client";

import Link from "next/link";
import { btnPrimary } from "@/components/admin/ui";
import { FormSubmitButton } from "@/components/admin/FormSubmitButton";

/**
 * Save row for the product edit page.
 *
 * Sits outside the <form> and joins it with the `form` attribute, so the Media
 * and Variants cards - which contain their own forms - can appear between the
 * product's fields while everything still saves with one button.
 */
export function ProductSaveBar({
  formId,
  action,
  label,
  className = "",
}: {
  formId: string;
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-end gap-3 ${className}`}>
      <Link
        href="/admin/products"
        className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Cancel
      </Link>
      <FormSubmitButton formId={formId} action={action} className={`${btnPrimary} px-8`}>
        {label}
      </FormSubmitButton>
    </div>
  );
}
