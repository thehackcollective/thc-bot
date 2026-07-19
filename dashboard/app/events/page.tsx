"use client";

import LeadList from "@/components/LeadList";

export default function EventsPage() {
  return (
    <>
      <div className="page-head">
        <h1>All events</h1>
        <p>Every lead the bot has seen, across all statuses. Filter to audit what shipped, what was rejected, and what is still waiting.</p>
      </div>
      <LeadList showFilters status="all" />
    </>
  );
}
