import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { PostEditor } from "@/components/admin/PostEditor";
import { createPost } from "../actions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

export const metadata: Metadata = { title: "Write a post" };
export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  await requireCapability("content");
  const storeName =
    (await getSettings())[SETTING_KEYS.storeName] || "Br3thr";
  const categories = await prisma.blogCategory.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/blog"
          aria-label="Back to blog"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Write a post
        </h1>
      </div>

      <PostEditor action={createPost} categories={categories} submitLabel="Save post" storeName={storeName} />
    </div>
  );
}
