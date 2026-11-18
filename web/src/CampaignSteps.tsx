import "./campaign-steps.css";

import { stepNames, stepStatus, type CampaignStep } from "./campaign-trace";

export function CampaignSteps({
  title,
  steps,
}: {
  title: string;
  steps: CampaignStep[];
}) {
  if (!steps.length) return null;
  return (
    <section className="cp-trace" aria-label="活动生成记录">
      <header>
        <h3>制作过程</h3>
        <span>{title}</span>
      </header>
      <ol>
        {steps.map((step) => (
          <li key={step.id} data-state={step.state}>
            <span className="cp-trace-mark" aria-hidden="true" />
            <details>
              <summary>
                <strong>{stepNames[step.id]}</strong>
                <span>{stepStatus[step.state]}</span>
              </summary>
              <p>
                {step.source}
                {step.detail && "\n" + step.detail}
              </p>
            </details>
          </li>
        ))}
      </ol>
      <span className="cp-trace-sr" role="status">
        {steps
          .map((step) => stepNames[step.id] + stepStatus[step.state])
          .join("，")}
      </span>
    </section>
  );
}
