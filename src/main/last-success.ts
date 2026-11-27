import type { ServiceFailure, ServiceName } from "../shared/api";

// How each outside service answered last, since the program started. Shown in Diagnostics.
const successes: Partial<Record<ServiceName, number>> = {};
const failures: Partial<Record<ServiceName, ServiceFailure>> = {};

export const markSuccess = (service: ServiceName) => {
  successes[service] = Date.now();
  delete failures[service];
};

export const markFailure = (service: ServiceName, reason: string) => {
  failures[service] = { at: Date.now(), reason };
};

export const lastSuccess = () => ({ ...successes });
export const lastFailure = () => ({ ...failures });
