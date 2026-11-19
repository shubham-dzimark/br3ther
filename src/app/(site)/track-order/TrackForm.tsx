"use client";

import { useActionState } from "react";
import { lookupOrder, type TrackResult } from "./actions";

/** Order number + email in, status out, on the same page. */
export function TrackForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = useActionState<TrackResult, FormData>(lookupOrder, { status: "idle" });

  return (
    <div className="two">
      <form action={action} className="panel form-narrow" aria-describedby="track-help">
        <div className="field">
          <label htmlFor="t-num">Order number</label>
          <input id="t-num" name="orderNumber" required placeholder="#0042" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="t-email">Email used for the order</label>
          <input id="t-email" name="email" type="email" required autoComplete="email" defaultValue={defaultEmail} />
        </div>
        <button className="btn" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Looking…" : "Find my order"}
        </button>
        <p id="track-help" className="small muted">Both are in your order confirmation email.</p>
      </form>

      <div aria-live="polite">
        {state.status !== "found" ? (
          <div className="panel panel--soft">
            <h2 className="panel__title">What you&rsquo;ll see</h2>
            <p className="muted">
              Whether the payment has landed, when the order is packed and shipped, and the tracking number with a link to
              follow the parcel once it&rsquo;s on its way.
            </p>
          </div>
        ) : null}
        {state.status === "error" ? <p className="notice" role="alert" style={{ marginTop: 16 }}>{state.message}</p> : null}
        {state.status === "found" ? (
          <div className="panel panel--dark on-dark">
            <h2 className="panel__title" style={{ fontSize: "2.25rem" }}>{state.statusLabel}</h2>
            <p className="muted-dark" style={{ marginTop: 6 }}>Order {state.orderNumber} · placed {state.placed}</p>
            {state.notice ? <p style={{ marginTop: 16 }}>{state.notice}</p> : null}

            {state.steps ? (
              <ol style={{ display: "grid", gap: 10, marginTop: 24 }}>
                {state.steps.map((s) => (
                  <li key={s.label} style={{ display: "flex", justifyContent: "space-between", gap: 16, opacity: s.state === "todo" ? 0.55 : 1 }}>
                    <span style={{ fontWeight: s.state === "current" ? 700 : 400, display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span className="stepmark" data-state={s.state} aria-hidden="true" />
                      {s.label}
                      <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (now)" : ""}</span>
                    </span>
                    <span className="muted-dark">{s.date ?? ""}</span>
                  </li>
                ))}
              </ol>
            ) : null}

            {state.tracking ? (
              <p style={{ marginTop: 24 }}>
                {state.tracking.carrierName ?? "Tracking"}: <b>{state.tracking.code}</b>{" "}
                {state.tracking.url ? (
                  <a className="link" href={state.tracking.url} target="_blank" rel="noopener noreferrer">Follow the parcel</a>
                ) : null}
              </p>
            ) : null}

            <dl className="rows" style={{ marginTop: 24 }}>
              {state.items.map((i, n) => (
                <div key={n}>
                  <dt>{i.quantity} × {i.name}{i.variant ? ` · ${i.variant}` : ""}</dt>
                  <dd />
                </div>
              ))}
              <div><dt>Total</dt><dd>{state.total}</dd></div>
              <div><dt>Ships to</dt><dd>{state.shipTo}</dd></div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
