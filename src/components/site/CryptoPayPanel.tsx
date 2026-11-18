"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The interactive half of the crypto payment page (the plugin's pay.js):
 * choosing a currency, the amount breakdown, the wallet address with a copy
 * button and QR code, the 30-minute refresh countdown, and "Mark as paid".
 *
 * Every figure comes from the portal via the server; nothing is computed here,
 * and no amount is ever sent back - the portal recomputes it on submission.
 */

export type CryptoMethod = {
  methodKey: string;
  label: string;
  symbol: string;
  network: string;
  address: string;
  description: string;
  hasQr: boolean;
  rateUuid: string;
  cryptoTotal: string;
  baseCrypto: string;
  feeCrypto: string;
};

const asset = (type: "logo" | "qr", method: string) =>
  `/api/crypto/asset?type=${type}&method=${encodeURIComponent(method)}`;

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function CryptoPayPanel({
  orderNumber,
  token,
  orderTotal,
  fiat,
  methods,
  submitted: initiallySubmitted,
  prev,
  countdownSeconds,
}: {
  orderNumber: string;
  token: string;
  orderTotal: string;
  fiat: string;
  methods: CryptoMethod[];
  submitted: boolean;
  prev: { txnHash: string; notes: string; hasScreenshot: boolean };
  countdownSeconds: number;
}) {
  const [remaining, setRemaining] = useState(countdownSeconds);
  const [selected, setSelected] = useState<CryptoMethod | null>(null);
  const [copied, setCopied] = useState(false);
  const [txnHash, setTxnHash] = useState(prev.txnHash);
  const [notes, setNotes] = useState(prev.notes);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const txnRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef<HTMLDivElement>(null);

  // Refresh on a 30-minute cycle so the exchange rates stay current.
  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          window.location.reload();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const copyAddress = async () => {
    const address = selected?.address.trim();
    if (!address) return;
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
        done();
        return;
      }
      throw new Error("no clipboard api");
    } catch {
      // Older browsers and non-HTTPS contexts: the textarea fallback.
      try {
        const ta = document.createElement("textarea");
        ta.value = address;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch {
        // Nothing more to try.
      }
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!selected) {
      setError("Please choose a currency.");
      return;
    }
    if (!txnHash.trim()) {
      txnRef.current?.focus();
      return;
    }

    setBusy(true);
    const form = new FormData();
    form.append("order", orderNumber);
    form.append("t", token);
    form.append("method_key", selected.methodKey);
    form.append("rate_uuid", selected.rateUuid);
    form.append("txn_hash", txnHash.trim());
    form.append("customer_notes", notes);
    const file = fileRef.current?.files?.[0];
    if (file) form.append("screenshot", file);

    try {
      const res = await fetch("/api/crypto/submit", { method: "POST", body: form, credentials: "same-origin" });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { message?: string; code?: string };
      };
      if (body.success) {
        setSubmitted(true);
        window.setTimeout(() => submittedRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      } else if (body.data?.code === "rate_expired") {
        setError(body.data.message || "The exchange rate has expired. Please refresh the page.");
        window.setTimeout(() => window.location.reload(), 2500);
      } else {
        setError(body.data?.message || "Could not submit payment.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sym = selected?.symbol ?? "";

  return (
    <>
      <p className="mb-6 rounded-xl border border-[rgb(var(--brand-rgb)/0.25)] bg-[rgb(var(--brand-soft-rgb)/0.5)] px-4 py-2.5 text-sm text-slate-700">
        This page refreshes in <span className="font-bold tabular-nums">{formatClock(remaining)}</span> to keep
        exchange rates current.
      </p>

      {methods.length === 0 ? (
        <p className="text-sm text-slate-600">No payable currencies are available right now. Please try again shortly.</p>
      ) : (
        <>
          <h2 className="mb-2 text-base font-semibold text-slate-900">Choose a currency</h2>
          <div className="space-y-2">
            {methods.map((m) => {
              const active = selected?.methodKey === m.methodKey;
              return (
                <label
                  key={m.methodKey}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    active ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="cp_method"
                    value={m.methodKey}
                    checked={active}
                    onChange={() => {
                      setSelected(m);
                      setError("");
                    }}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset("logo", m.methodKey)} alt="" width={28} height={28} className="h-7 w-7" />
                  <span className="font-semibold text-slate-900">{m.label}</span>
                </label>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-8 pt-2">
              <table className="mb-5 w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1.5 text-slate-600">Order amount</td>
                    <td className="py-1.5 text-right">
                      <div className="text-slate-900">
                        {orderTotal} {fiat}
                      </div>
                      <div className="text-xs text-slate-500">
                        {selected.baseCrypto} {sym}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-600">Transaction fee</td>
                    <td className="py-1.5 text-right text-slate-900">
                      {selected.feeCrypto} {sym}
                    </td>
                  </tr>
                  <tr>
                    <td className="pt-2.5 font-semibold text-slate-900">Total to pay</td>
                    <td className="pt-2.5 text-right text-base font-bold text-slate-900">
                      {selected.cryptoTotal} {sym}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="block text-xs text-slate-500">Send to ({selected.network})</span>
                <span className="mt-1 flex items-stretch gap-2">
                  <code className="flex-1 break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                    {selected.address}
                  </code>
                  <button
                    type="button"
                    onClick={copyAddress}
                    aria-label="Copy wallet address"
                    className={`shrink-0 rounded-full border px-3 text-sm font-semibold transition ${
                      copied
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-[rgb(var(--brand-rgb)/0.35)] bg-white text-[var(--brand)] hover:bg-[var(--brand-soft)]"
                    }`}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </span>
                {selected.hasQr ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={asset("qr", selected.methodKey)}
                    alt="Wallet QR"
                    width={180}
                    height={180}
                    className="my-3 h-[180px] w-[180px] rounded-lg bg-white"
                  />
                ) : null}
                {selected.description ? (
                  <p className="mt-2 text-sm text-slate-600">{selected.description}</p>
                ) : null}
              </div>

              <form onSubmit={submit} className="space-y-4" encType="multipart/form-data">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-800">
                    Transaction ID (TXN) <span className="text-rose-600">*</span>
                  </span>
                  <input
                    ref={txnRef}
                    required
                    value={txnHash}
                    onChange={(e) => setTxnHash(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-800">Payment screenshot (optional)</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="block w-full text-sm text-slate-600"
                  />
                  {prev.hasScreenshot ? (
                    <span className="mt-1 block text-xs text-slate-500">
                      A screenshot is already on file; upload to replace it.
                    </span>
                  ) : null}
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-800">Notes (optional)</span>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                  />
                </label>
                {error ? (
                  <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-[var(--brand-cta)] px-7 py-3 text-sm font-semibold text-[var(--brand-cta-ink)] transition hover:brightness-95 disabled:opacity-60"
                >
                  {busy ? "Submitting…" : "Mark as paid"}
                </button>
              </form>
            </div>
          ) : error ? (
            <p role="alert" className="mt-4 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div
            ref={submittedRef}
            className={submitted ? "mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" : "hidden"}
          >
            Your payment details have been submitted. We will review the transaction and proceed with the payment.
            You may update the details below if needed.
          </div>
        </>
      )}
    </>
  );
}
