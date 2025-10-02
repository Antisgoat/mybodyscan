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

const SemanticAttributes = createProxy();
const SemanticResourceAttributes = createProxy();
const DbSystemValues = createProxy();
const FaasTriggerValues = createProxy();
const MessagingOperationTypes = createProxy();
const NetTransportValues = createProxy();
const SpanAttributes = createProxy();
const AttributeNames = createProxy();
const AttributeShortNames = createProxy();
const GeneralAttributeIds = createProxy();
const HttpAttributeNames = createProxy();
const MessagingAttributeIds = createProxy();
const MessagingDestinationNames = createProxy();

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

module.exports = {
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
  default: defaultExport,
};
