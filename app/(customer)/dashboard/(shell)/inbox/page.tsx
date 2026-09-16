import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  CalendarClock,
  CarFront,
  Check,
  CreditCard,
  FileText,
  MessageSquare,
  ShieldAlert,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { EmptyState, Notice, Overline, PageHeader, Panel, Screen, Tile, UnreadDot } from "@/components/dashboard/ui";
import { loadInbox } from "@/lib/inbox/feed";
import { isUnread, unreadCount } from "@/lib/inbox/read-state";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { MarkAllReadButton } from "./_components/mark-all-read";
import { OpenInboxItem } from "./_components/open-item";
import {
  INBOX_TABS,
  filterInboxTab,
  groupInboxByDay,
  inboxDetail,
  inboxHref,
  inboxTimeLabel,
  inboxVisual,
  parseInboxTab,
  type InboxIcon,
  type InboxTab,
} from "./_lib/presentation";

// The Inbox (Task 48, mockup 02 "Notifications"): booking news and reminders
// from lib/inbox/feed.ts (Task 52), under All / Bookings / Reminders tabs and
// day headings, with unread dots and Mark all read. Before migration 0075 the
// feed still loads; nothing can be marked read, so Mark all read is hidden.

const ICONS: Record<InboxIcon, LucideIcon> = {
  car: CarFront,
  quote: FileText,
  check: Check,
  cross: X,
  card: CreditCard,
  dispute: ShieldAlert,
  bell: Bell,
  calendar: CalendarClock,
  wrench: Wrench,
  message: MessageSquare,
};

const EMPTY: Record<InboxTab, { title: string; body: string }> = {
  all: {
    title: "No notifications yet",
    body: "News about your bookings and reminders for your vehicles will appear here.",
  },
  bookings: { title: "No booking news yet", body: "Updates about your bookings will appear here." },
  reminders: {
    title: "No reminders yet",
    body: "MOT, service and seasonal reminders we send you will appear here.",
  },
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tab = parseInboxTab((await searchParams).tab);
  const inbox = await loadInbox(supabase);

  if (!inbox.ok) {
    return (
      <Screen>
        <PageHeader title="Notifications" />
        <Notice tone="danger" icon={TriangleAlert} title={inbox.error} />
      </Screen>
    );
  }

  const now = new Date();
  const anyUnread = inbox.readStateStored && unreadCount(inbox.items, inbox.readState, now) > 0;
  const groups = groupInboxByDay(filterInboxTab(inbox.items, tab), now);

  return (
    <Screen>
      <PageHeader title="Notifications" action={anyUnread ? <MarkAllReadButton /> : undefined} />

      <nav aria-label="Filter notifications" className="flex gap-2">
        {INBOX_TABS.map((option) => {
          const active = option.id === tab;
          return (
            <Link
              key={option.id}
              href={option.href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                active ? "bg-surface-dark text-white" : "text-text-secondary hover:bg-border-subtle hover:text-text-primary",
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-3.5 flex flex-col gap-4">
        {groups.length === 0 ? (
          <EmptyState icon={Bell} title={EMPTY[tab].title} body={EMPTY[tab].body} />
        ) : (
          groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-2.5">
              <Overline>{group.label}</Overline>
              {group.items.map((item) => {
                const unread = isUnread(item, inbox.readState, now);
                const visual = inboxVisual(item);
                const detail = inboxDetail(item);
                return (
                  <OpenInboxItem key={item.id} id={item.id} href={inboxHref(item)} unread={unread}>
                    <Panel className="transition-colors group-hover:border-slate-300">
                      <div className="flex items-start gap-3">
                        <Tile icon={ICONS[visual.icon]} tone={visual.tone} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-bold leading-5 text-text-primary">{item.title}</div>
                            <UnreadDot unread={unread} className="mt-1.5" />
                          </div>
                          {detail && <div className="mt-1 text-xs leading-4 text-text-secondary">{detail}</div>}
                          <time dateTime={item.at} className="mt-1.5 block text-xs leading-4 text-slate-400">
                            {inboxTimeLabel(item.at)}
                          </time>
                        </div>
                      </div>
                    </Panel>
                  </OpenInboxItem>
                );
              })}
            </section>
          ))
        )}
      </div>
    </Screen>
  );
}
