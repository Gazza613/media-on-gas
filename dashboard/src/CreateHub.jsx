// Create hub. As of Phase 5 of the Sami Hub rebuild
// (project_sami_hub_rebuild memory), Sami Hub is the ONLY Create
// experience. The legacy 7-step wizard (CreateTab), the Quick
// Brief bar (BriefBar), and the read-only Media AI tab (NlpTab)
// have been removed. Sami handles reads AND writes in one
// unified conversational surface.
//
// This file stays as a thin passthrough so upstream App.jsx doesn't
// need to change its import. If we ever add a second Create mode
// again, mode-switching logic goes back here.

import CreateChatTab from "./CreateChatTab.jsx";

export default function CreateHub(props) {
  return <CreateChatTab {...props} />;
}
