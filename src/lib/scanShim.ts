export async function requestScanMock(): Promise<never> {
  throw new Error('scan shim removed');
}

export async function listScansMock(): Promise<[]> {
  return [];
}

export async function latestScanMock(): Promise<undefined> {
  return undefined;
}
