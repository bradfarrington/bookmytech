"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Images, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { confirmPartGroupMatch, markPartGroupNoMatch, resetPartGroupMatch } from "@/app/actions/part-groups";
import { Button } from "@/components/ui/button";
import type { ResolvedPartGroupLink } from "@/lib/parts/part-group-match";
import { useCatalogueAction } from "../../../repairs/_components/use-catalogue-action";
import { PartGroupMatcher } from "./part-group-matcher";

// The decision controls for one part group on /admin/parts/groups (Task 45).
// Each button is one server action; the list is server-rendered and refreshes
// after every change.
//
// There are deliberately no one-click "Use <name>" suggestions here. A name
// that shares a word with the group is a guess, and a row of them reads like a
// list of part group options. Matching goes through the matcher, which shows
// LKQ's real parts on a chosen car first. The one exception is confirming an
// auto-match, where the names are word-for-word identical.

export interface ComponentOption {
  number: string;
  name: string;
}

const MATCH_LABEL: Record<ResolvedPartGroupLink["kind"], string> = {
  unmatched: "Find the LKQ part",
  stale: "Find the LKQ part",
  no_match: "Find the LKQ part",
  auto: "Check the match",
  confirmed: "Change the match",
};

export function PartGroupReview({
  genartId,
  description,
  reg,
  kind,
  current,
}: {
  genartId: number;
  description: string;
  /** The car chosen at the top of the page to check LKQ's parts on. */
  reg: string | null;
  kind: ResolvedPartGroupLink["kind"];
  current: ComponentOption | null;
}) {
  const router = useRouter();
  const { pending, run } = useCatalogueAction();
  const [matching, setMatching] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button
          size="sm"
          variant="secondary"
          iconLeft={Images}
          disabled={pending}
          onClick={() =>
            reg
              ? setMatching((open) => !open)
              : toast.error("Pick a car at the top of the page first. Matching checks LKQ's parts on a real car.")
          }
        >
          {matching ? "Close" : MATCH_LABEL[kind]}
        </Button>
        {kind === "auto" && current && (
          <Button
            size="sm"
            variant="success"
            iconLeft={Check}
            disabled={pending}
            onClick={() =>
              run(() => confirmPartGroupMatch({ genartId, componentNumber: current.number }), {
                success: `Matched to ${current.name}.`,
              })
            }
          >
            Confirm match
          </Button>
        )}
        {kind !== "no_match" && kind !== "confirmed" && (
          <Button
            size="sm"
            variant="ghost"
            iconLeft={X}
            disabled={pending}
            onClick={() => run(() => markPartGroupNoMatch({ genartId }), { success: "Marked as no LKQ equivalent." })}
          >
            No LKQ equivalent
          </Button>
        )}
        {(kind === "confirmed" || kind === "no_match" || kind === "stale") && (
          <Button
            size="sm"
            variant="tertiary"
            iconLeft={Undo2}
            disabled={pending}
            onClick={() => run(() => resetPartGroupMatch({ genartId }), { success: "Back to unreviewed." })}
          >
            Undo
          </Button>
        )}
      </div>
      {matching && reg && (
        <PartGroupMatcher
          key={reg}
          genartId={genartId}
          description={description}
          reg={reg}
          current={current}
          confirmed={kind === "confirmed"}
          onMatched={() => {
            setMatching(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
