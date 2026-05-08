"use client";

export type RegistrationPreferencesData = {
  ethnicity: string;
  religion: string;
  languagesInput: string;
  relationshipStatus:
    | "never_married"
    | "divorced"
    | "widowed"
    | "separated"
    | "married_non_monogamous"
    | "i_will_tell_you_later"
    | "";
  relationshipType: string;
  wantChildren: "yes" | "no" | "maybe" | "undecided" | "";
  haveChildren: "yes" | "no" | "";
  careerStability: string;
  readyForMarriage: "yes" | "no" | "not_sure" | "";
  willingToRelocate: "yes" | "no" | "maybe" | "";
  loveLanguages: string[];
};

type PreferencesFormProps = {
  data: RegistrationPreferencesData;
  onChange: (next: RegistrationPreferencesData) => void;
};

const LOVE_LANGUAGE_OPTIONS = [
  "words_of_affirmation",
  "acts_of_service",
  "quality_time",
  "physical_touch",
  "receiving_gifts",
];

function toLabel(value: string) {
  return value
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export default function PreferencesForm({ data, onChange }: PreferencesFormProps) {
  const setField = <K extends keyof RegistrationPreferencesData>(field: K, value: RegistrationPreferencesData[K]) => {
    onChange({
      ...data,
      [field]: value,
    });
  };

  const toggleLoveLanguage = (value: string) => {
    const exists = data.loveLanguages.includes(value);
    const next = exists
      ? data.loveLanguages.filter((item) => item !== value)
      : [...data.loveLanguages, value];

    onChange({
      ...data,
      loveLanguages: next,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-gray-700">
          <span className="mb-1.5 block font-medium">Ethnicity</span>
          <input
            type="text"
            value={data.ethnicity}
            onChange={(event) => setField("ethnicity", event.target.value)}
            placeholder="e.g. Yoruba, Igbo, Hausa"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
          />
        </label>

        <label className="block text-sm text-gray-700">
          <span className="mb-1.5 block font-medium">Religion</span>
          <input
            type="text"
            value={data.religion}
            onChange={(event) => setField("religion", event.target.value)}
            placeholder="e.g. Christian"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
          />
        </label>
      </div>

      <label className="block text-sm text-gray-700">
        <span className="mb-1.5 block font-medium">Languages</span>
        <input
          type="text"
          value={data.languagesInput}
          onChange={(event) => setField("languagesInput", event.target.value)}
          placeholder="English, Yoruba"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
        />
        <span className="mt-1 block text-xs text-gray-500">Use commas to separate multiple languages.</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-gray-700">
          <span className="mb-1.5 block font-medium">Current relationship status</span>
          <select
            value={data.relationshipStatus}
            onChange={(event) =>
              setField(
                "relationshipStatus",
                event.target.value as RegistrationPreferencesData["relationshipStatus"]
              )
            }
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
          >
            <option value="">Select...</option>
            <option value="never_married">Never married</option>
            <option value="separated">Separated</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
            <option value="married_non_monogamous">Married (non-monogamous)</option>
            <option value="i_will_tell_you_later">I will tell you later</option>
          </select>
        </label>

        <label className="block text-sm text-gray-700">
          <span className="mb-1.5 block font-medium">Relationship type</span>
          <select
            value={data.relationshipType}
            onChange={(event) => setField("relationshipType", event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
          >
            <option value="">Select...</option>
            <option value="serious_relationship">Serious relationship</option>
            <option value="marriage">Marriage</option>
            <option value="friendship">Friendship first</option>
            <option value="undecided">Undecided</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-gray-700">
          <span className="mb-1.5 block font-medium">Do you have children?</span>
          <select
            value={data.haveChildren}
            onChange={(event) =>
              setField("haveChildren", event.target.value as RegistrationPreferencesData["haveChildren"])
            }
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
          >
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <label className="block text-sm text-gray-700">
          <span className="mb-1.5 block font-medium">Do you want children?</span>
          <select
            value={data.wantChildren}
            onChange={(event) =>
              setField("wantChildren", event.target.value as RegistrationPreferencesData["wantChildren"])
            }
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
          >
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="maybe">Maybe</option>
            <option value="undecided">Undecided</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-gray-700">
          <span className="mb-1.5 block font-medium">Career stability</span>
          <select
            value={data.careerStability}
            onChange={(event) => setField("careerStability", event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
          >
            <option value="">Select...</option>
            <option value="stable">Stable career</option>
            <option value="building">Building career</option>
            <option value="entrepreneur">Entrepreneur</option>
            <option value="student">Student</option>
          </select>
        </label>

        <label className="block text-sm text-gray-700">
          <span className="mb-1.5 block font-medium">Ready for marriage?</span>
          <select
            value={data.readyForMarriage}
            onChange={(event) =>
              setField(
                "readyForMarriage",
                event.target.value as RegistrationPreferencesData["readyForMarriage"]
              )
            }
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
          >
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="not_sure">Not sure</option>
          </select>
        </label>
      </div>

      <label className="block text-sm text-gray-700">
        <span className="mb-1.5 block font-medium">Willing to relocate?</span>
        <select
          value={data.willingToRelocate}
          onChange={(event) =>
            setField(
              "willingToRelocate",
              event.target.value as RegistrationPreferencesData["willingToRelocate"]
            )
          }
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
        >
          <option value="">Select...</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="maybe">Maybe</option>
        </select>
      </label>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm font-medium text-gray-700">Love language</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {LOVE_LANGUAGE_OPTIONS.map((option) => {
            const checked = data.loveLanguages.includes(option);
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  checked
                    ? "border-[#1f419a]/40 bg-[#eef2ff] text-[#1f419a]"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleLoveLanguage(option)}
                  className="h-4 w-4 rounded border-gray-300 text-[#1f419a] focus:ring-[#1f419a]/40"
                />
                {toLabel(option)}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
