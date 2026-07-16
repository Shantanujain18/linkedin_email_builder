import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { addDraftNote, deleteDraftNote, getNotesForDraft, userOwnsDraft } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const draftId = Number(new URL(request.url).searchParams.get("draftId"));
    if (!Number.isFinite(draftId) || draftId < 1) {
      return NextResponse.json({ error: "draftId is required." }, { status: 400 });
    }
    if (!userOwnsDraft(user.id, draftId)) {
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    }
    return NextResponse.json({ notes: getNotesForDraft(draftId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load notes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = await request.json();
    const draftId = Number(body.draftId);
    if (!Number.isFinite(draftId) || draftId < 1) {
      return NextResponse.json({ error: "draftId is required." }, { status: 400 });
    }
    if (!userOwnsDraft(user.id, draftId)) {
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    }
    const note = addDraftNote(draftId, String(body.note || ""));
    return NextResponse.json({ note, notes: getNotesForDraft(draftId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to add note." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: "Note id is required." }, { status: 400 });
    }
    const deleted = deleteDraftNote(user.id, id);
    if (!deleted) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete note." }, { status: 500 });
  }
}
