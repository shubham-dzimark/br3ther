import { Card } from "./ui";

/** Standard white card with a title row, used by every list screen. */
export function PageCard({
  title,
  action,
  children,
  toolbar,
}: {
  title: string;
  action?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <h1 className="adm-display text-xl font-semibold text-slate-900">{title}</h1>
        {action}
      </div>
      {toolbar ? <div className="px-6 py-5">{toolbar}</div> : <div className="h-5" />}
      {children}
    </Card>
  );
}

export const TH = ({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) => (
  <th
    className={`px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
      align === "right" ? "text-right" : "text-left"
    }`}
  >
    {children}
  </th>
);

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="px-6 pb-12 text-center text-sm text-slate-500">{children}</p>
);
