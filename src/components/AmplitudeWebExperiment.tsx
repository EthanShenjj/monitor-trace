import Script from "next/script";

const webExperimentScriptUrl = process.env.NEXT_PUBLIC_AMPLITUDE_WEB_EXPERIMENT_SCRIPT_URL;

export default function AmplitudeWebExperiment() {
  if (!webExperimentScriptUrl) {
    return null;
  }

  return (
    // Next 16 App Router docs allow beforeInteractive scripts in app/layout.
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script
      id="amplitude-web-experiment"
      src={webExperimentScriptUrl}
      strategy="beforeInteractive"
    />
  );
}
