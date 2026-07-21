import { NextResponse } from "next/server";
import {
  clearFlags,
  flagStats,
  getFlag,
  listFlags,
  recordFlagAction,
  setFlagStatus,
  type FlagStatus,
} from "@/lib/db";
import { readSettings } from "@/lib/settings";
import { deleteMessage, removeParticipant } from "@/lib/wa-actions";

export const dynamic = "force-dynamic"; // always read fresh from SQLite

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") as FlagStatus | "all" | null;
  const flags = status && status !== "all" ? listFlags(status) : listFlags();
  return NextResponse.json({
    flags,
    stats: flagStats(),
    actionsEnabled: readSettings().moderationActionsEnabled,
  });
}

/**
 * Clear flags from the review queue. `?status=` limits it to one bucket; omitted
 * or `all` clears everything. Local queue only — never touches WhatsApp.
 */
export async function DELETE(req: Request) {
  try {
    const status = new URL(req.url).searchParams.get("status") as FlagStatus | "all" | null;
    const cleared = clearFlags(status && status !== "all" ? status : undefined);
    return NextResponse.json({ ok: true, cleared });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { id, action } = await req.json();
    const flagId = Number(id);

    // Irreversible WhatsApp writes. Gated by the moderationActionsEnabled setting
    // (enforced again inside wa-actions) and confirmed in the UI before we get here.
    if (action === "delete" || action === "remove") {
      const flag = getFlag(flagId);
      if (!flag) throw new Error("flag not found");
      try {
        if (action === "delete") {
          // Deliberately no fall back to sourceChat: wacli reads --chat as a phone
          // number for legacy-format group JIDs and fails confusingly on a name.
          await deleteMessage(flag.chatJid ?? "", flag.sourceMsgId);
        } else {
          await removeParticipant(flag.chatJid ?? "", flag.senderJid ?? "");
        }
      } catch (e: any) {
        const msg = String(e?.message || e);
        recordFlagAction(flagId, action, msg);
        throw e;
      }
      recordFlagAction(flagId, action, null);
      return NextResponse.json({ ok: true });
    }

    if (action !== "confirm" && action !== "dismiss") throw new Error("unknown action");
    setFlagStatus(flagId, action === "confirm" ? "confirmed" : "dismissed");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
