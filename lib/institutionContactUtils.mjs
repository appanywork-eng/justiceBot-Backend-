const ADDRESS_KEYS = new Set([
  "address",
  "addresses",
  "primaryaddress",
  "physicaladdress",
  "postaladdress",
  "officeaddress",
  "headoffice",
  "headofficeaddress",
  "headquarters",
  "headquartersaddress",
  "hqaddress",
  "location",
  "locations",
]);

const ADDRESS_INDICATOR_PATTERN =
  /\b(street|road|avenue|close|crescent|drive|lane|way|boulevard|expressway|highway|junction|plot|block|suite|floor|building|complex|estate|district|secretariat|headquarters|head office|office|house|quarters|campus|opposite|beside|behind|pmb|p\.m\.b\.?|po box|p\.o\.\s*box|abuja|lagos|fct|ikeja|maitama|asokoro|garki|wuse|apo|jabi|kubwa)\b/i;

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isAddressKey(value) {
  return ADDRESS_KEYS.has(
    normalizeKey(value)
  );
}

export function isLikelyAddress(value) {
  if (typeof value !== "string") {
    return false;
  }

  const text = value
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 8) {
    return false;
  }

  if (text.includes("@")) {
    return false;
  }

  if (/https?:\/\//i.test(text)) {
    return false;
  }

  /*
   * Country names and institution aliases
   * alone are not physical addresses.
   */
  if (
    /^(nigeria|nigerian|federal|state)?\s*(ombudsman|commission|ministry|agency|authority)$/i
      .test(text)
  ) {
    return false;
  }

  return (
    /\d/.test(text) ||
    ADDRESS_INDICATOR_PATTERN.test(text)
  );
}

export function extractAddressesDeep(
  value,
  output = [],
  keyHint = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return output;
  }

  if (typeof value === "string") {
    const text = value
      .replace(/\s+/g, " ")
      .trim();

    /*
     * Only explicitly named address or
     * location fields may supply an address.
     * Aliases, mandates and descriptions
     * are deliberately ignored.
     */
    if (
      isAddressKey(keyHint) &&
      isLikelyAddress(text)
    ) {
      output.push(text);
    }

    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractAddressesDeep(
        item,
        output,
        keyHint
      );
    }

    return output;
  }

  if (typeof value === "object") {
    for (
      const [key, item]
      of Object.entries(value)
    ) {
      extractAddressesDeep(
        item,
        output,
        key
      );
    }
  }

  return output;
}
