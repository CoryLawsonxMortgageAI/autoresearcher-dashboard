import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

let sdk: NodeSDK | null = null;

export const initOtel = async (): Promise<void> => {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    console.warn("[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set; skipping init");
    return;
  }
  sdk = new NodeSDK({
    serviceName: "autoresearcher-api",
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
};

export const shutdownOtel = async (): Promise<void> => {
  if (sdk) await sdk.shutdown();
};
