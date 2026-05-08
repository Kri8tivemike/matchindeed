export type RelationshipAgreementTemplateParams = {
  userOneName: string;
  userTwoName: string;
  meetingDate?: string | null;
};

function formatParticipantName(name: string) {
  const normalized = (name || "").trim();
  return normalized.length > 0 ? normalized : "Participant";
}

function formatMeetingDate(meetingDate?: string | null) {
  if (!meetingDate) {
    return "the date of our completed video meeting";
  }

  const parsedDate = new Date(meetingDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return "the date of our completed video meeting";
  }

  return parsedDate.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function buildRelationshipAgreementText(
  params: RelationshipAgreementTemplateParams
) {
  const userOne = formatParticipantName(params.userOneName);
  const userTwo = formatParticipantName(params.userTwoName);
  const meetingDate = formatMeetingDate(params.meetingDate);

  return [
    "MATCHINDEED RELATIONSHIP AGREEMENT",
    "",
    `We, ${userOne} and ${userTwo}, confirm that after our completed MatchIndeed video meeting on ${meetingDate},`,
    "we both chose YES to continue intentionally.",
    "",
    "By signing this agreement, both participants acknowledge:",
    "1. We consent to continued communication through MatchIndeed messaging.",
    "2. We will engage respectfully and in good faith.",
    "3. We understand both profiles will move to \"Profile Offline - Matched\" after both signatures.",
    "",
    "This agreement becomes active only when both participants have signed.",
  ].join("\n");
}
