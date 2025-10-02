const createProxy = () =>
  new Proxy(
    {},
    {
      get: () => undefined,
      set: () => false,
      has: () => true,
      ownKeys: () => [],
    },
  );

export const SemanticAttributes = createProxy();
export const SemanticResourceAttributes = createProxy();
export const DbSystemValues = createProxy();
export const FaasTriggerValues = createProxy();
export const MessagingOperationTypes = createProxy();
export const NetTransportValues = createProxy();
export const SpanAttributes = createProxy();
export const AttributeNames = createProxy();
export const AttributeShortNames = createProxy();
export const GeneralAttributeIds = createProxy();
export const HttpAttributeNames = createProxy();
export const MessagingAttributeIds = createProxy();
export const MessagingDestinationNames = createProxy();

const defaultExport = {
  SemanticAttributes,
  SemanticResourceAttributes,
  DbSystemValues,
  FaasTriggerValues,
  MessagingOperationTypes,
  NetTransportValues,
  SpanAttributes,
  AttributeNames,
  AttributeShortNames,
  GeneralAttributeIds,
  HttpAttributeNames,
  MessagingAttributeIds,
  MessagingDestinationNames,
};

export default defaultExport;
