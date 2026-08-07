import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { deletePostsByIds, getPublicProfile, listPostsPage } from "@/lib/db";
import { parsePage, parsePageSize, type PostFilter } from "@/lib/post-draft-status";

export const runtime = "nodejs";

const POST_FILTERS = new Set<PostFilter>(["all", "valid", "invalid", "drafted", "skipped", "pending"]);

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const url = new URL(request.url);
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parsePageSize(url.searchParams.get("pageSize"));
    const filterRaw = String(url.searchParams.get("filter") || "all") as PostFilter;
    const filter = POST_FILTERS.has(filterRaw) ? filterRaw : "all";
    const q = String(url.searchParams.get("q") || "");
    const date = String(url.searchParams.get("date") || "");

    const profile = await getPublicProfile(user.id);
    const topSkills = String((profile as Record<string, unknown> | null)?.top_skills || "");

    const result = await listPostsPage(user.id, {
      page,
      pageSize,
      filter,
      q,
      date,
      topSkills
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load posts." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.map((value: unknown) => Number(value)).filter((id: number) => Number.isFinite(id) && id > 0)
      : [];

    if (!ids.length) {
      return NextResponse.json({ error: "Select at least one post to delete." }, { status: 400 });
    }

    const deleted = await deletePostsByIds(user.id, ids);
    return NextResponse.json({ deleted, ids });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete posts." },
      { status: 500 }
    );
  }
}
