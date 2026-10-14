"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { renderMentionBody } from "@/lib/status-updates/utils";
import { useDashboardReturnPath } from "@/lib/procurement/use-dashboard-return-path";

interface MentionBodyProps {
  body: string;
  profileNames: Map<string, string>;
}

export function MentionBody({ body, profileNames }: MentionBodyProps) {
  const pathname = usePathname() ?? "";
  return (
    <Suspense
      fallback={<>{renderMentionBody(body, profileNames, pathname)}</>}
    >
      <MentionBodyResolved body={body} profileNames={profileNames} />
    </Suspense>
  );
}

function MentionBodyResolved({ body, profileNames }: MentionBodyProps) {
  const returnPath = useDashboardReturnPath();
  return <>{renderMentionBody(body, profileNames, returnPath)}</>;
}
