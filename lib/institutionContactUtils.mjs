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
   * An address should contain either
   * a number or a genuine physical
   * location/address indicator.
   *
   * Country names alone are not enough.
   */
  return (
    /\d/.test(text) ||
    /\b(
      street|
      road|
      avenue|
      close|
      crescent|
      drive|
      lane|
      way|
      boulevard|
      expressway|
      highway|
      junction|
      plot|
      block|
      suite|
      floor|
      building|
      complex|
      estate|
      district|
      secretariat|
      headquarters|
      head\s+office|
      office|
      house|
      quarters|
      campus|
      opposite|
      beside|
      behind|
      off|
      pmb|
      p\.m\.b\.?|
      po\s+box|
      p\.o\.\s*box|
      abuja|
      lagos|
      fct|
      ikeja|
      maitama|
      asokoro|
      garki|
      wuse|
      apo|
      jabi|
      kubwa
    )\b/ix.test(text)
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
     * Only fields explicitly named as
     * addresses or locations may supply
     * institution addresses.
     *
     * Aliases, mandates and descriptions
     * must never be treated as addresses.
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

  if (
    typeof value === "object"
  ) {
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
