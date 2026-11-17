// The admin Parts gaps screen (Task 77) is local-only for now (Brad,
// 2026-11-17: "hide the parts gap page from the live site … we haven't
// figured out what we're doing with that yet"). It shows on `next dev` and
// nowhere else: not on production, not on preview deploys. The pricing it
// feeds (engine codes, approved code matches, model part picks, gap
// recording) runs everywhere, but does nothing until something is approved
// or picked on this screen.
//
// It has no sidebar link anywhere (Brad: "we dont want it in the sidebar
// either"); locally it's reached by typing /admin/parts/gaps. To switch it
// on for the live site, make this true and add a link in
// components/admin/sidebar.tsx.
export const PARTS_GAPS_SCREEN_ENABLED = process.env.NODE_ENV === "development";
