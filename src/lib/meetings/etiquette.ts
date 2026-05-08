export const MEETING_ETIQUETTE_CHECKLIST: string[] = [
  "Join on time (you may enter up to 10 minutes early).",
  "Keep your camera on and face visible during the call.",
  "Test microphone and internet before joining.",
  "Stay respectful and avoid abusive language.",
  "Do not record the meeting unless explicitly permitted by MatchIndeed.",
  "Avoid multitasking and stay present throughout the session.",
  "Use a quiet, safe, and private environment.",
  "Report technical issues immediately through platform support.",
  "Do not share personal payment or financial details.",
  "Complete post-meeting response honestly (YES/NO).",
];

export function getEtiquetteChecklistText() {
  return MEETING_ETIQUETTE_CHECKLIST.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

export function getEtiquetteSummaryMessage() {
  return "Please acknowledge the meeting etiquette checklist before joining your video meeting.";
}
