/*
 * What an import did, shared by the server action that performs it and the
 * screen that reports it.
 *
 * Its own module, with no "server-only" and no database import, for two
 * reasons: a "use server" file may only export async functions, so the empty
 * value below cannot live beside the action; and the form that renders this is
 * a client component, so it has to be able to import the value for real rather
 * than as a type.
 */

/** One row that could not be applied, and the line of the file it came from. */
export type ImportIssue = { line: number; message: string };

export type ImportResult = {
  status: "idle" | "done" | "error";
  message?: string;
  productsCreated: number;
  productsUpdated: number;
  optionsCreated: number;
  optionsUpdated: number;
  issues: ImportIssue[];
};

export const EMPTY_RESULT: ImportResult = {
  status: "idle",
  productsCreated: 0,
  productsUpdated: 0,
  optionsCreated: 0,
  optionsUpdated: 0,
  issues: [],
};
