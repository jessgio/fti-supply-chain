import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPoLineProductType,
  packagingTypeFromSku,
} from "./po-product-type";

test("unit boxes, eflute, blisters, and shippers are secondary packaging", () => {
  const secondary = [
    ["FCR-BGR-EYECREAM-15ML-UB", "BALI GREEN COFFEE ESPRESSO EYE CREAM (15 ML) - UNIT BOX"],
    ["FCR-TGV-BARRIERMOISTUREGEL-50ML-UBV3", "TROPICAL GUAVA BARRIER MOISTURE GEL (50 ML) - UNIT BOX"],
    ["FCR-PRF-PLUMPINGCREAM-15ML-EFLUTE", "PAPUA RED FRUIT PLUMPING CREAM (15 ML) - EFLUTE"],
    ["FCR-TGV-BARRIERMOISTUREGEL-20ML-EFLUTEV2", "FCR-TGV-BARRIERMOISTUREGEL-20ML-EFLUTEV2"],
    ["ILLIPE-MINI-BERRYBURST-BLISTER", "MINI ILLIPE PLUMPING LIP BUTTER - BLISTER UNIT BOX"],
    ["BOX-SHIPPINGBOX-SIZE S-20X9X7", "SHIPPING BOX - SMALL (20 X 9 X 7 CM)"],
    ["MER-SLEEVE-EVERYDAYRITUALS", "MER-SLEEVE-EVERYDAYRITUALS"],
    ["MER-HOLIDAYBOX-BERRYCLEAR", "MER-HOLIDAYBOX-BERRYCLEAR"],
    ["PKG-STC-BGR-EYECREAM-SOCIOLLA", "SOCIOLLA STICKER - BGR EYE CREAM"],
  ] as const;

  for (const [code, name] of secondary) {
    assert.equal(
      classifyPoLineProductType({
        skuCode: code,
        skuName: name,
        isPackaging: true,
      }),
      "secondary_packaging",
      code,
    );
  }
});

test("containers and closures are primary packaging, including glued version suffixes", () => {
  const primary = [
    ["FCR-PRF-PLUMPINGCREAM-15ML-JAR", "PAPUA RED FRUIT PLUMPING CREAM (15 ML) - JAR"],
    ["FCR-PRF-PLUMPINGCREAM-15ML-PUMP", "PAPUA RED FRUIT PLUMPING CREAM (15 ML) - PUMP"],
    ["FSE-MGT-BRIGHTENINGSERUM-15ML-V2-BOTTLEV2", "MANGOSTEEN BRIGHTENING SERUM (15 ML) - BOTTLE"],
    ["FSE-MGT-BRIGHTENINGSERUM-30ML-V2-BOTTLEV3", "MANGOSTEEN BRIGHTENING SERUM (30 ML) - BOTTLE (SANDBLASTING)"],
    ["FTO-SGC-AHASOLUTION-50ML-PLUGV2", "FTO-SGC-AHASOLUTION-50ML-PLUGV2"],
    ["FCR-BGR-EYECREAM-15ML-CAPTUBE", "BALI GREEN COFFEE ESPRESSO EYE CREAM (15 ML) - CAP AND TUBE"],
    ["FSE-PRF-PLUMPINGSERUM-20ML-DROPPER", "PAPUA RED FRUIT POTENT PLUMPING SERUM (20 ML) - DROPPER"],
    ["FCR-TGV-BARRIERMOISTUREGEL-50ML-LID-V3", "TROPICAL GUAVA BARRIER MOISTURE GEL (50 ML) - LID"],
    ["FWA-BLP-MICELLARWATER-100ML-CAP", "BLUE PEA PURIFYING MICELLAR WATER (100 ML) - CAP"],
  ] as const;

  for (const [code, name] of primary) {
    assert.equal(
      classifyPoLineProductType({
        skuCode: code,
        skuName: name,
        isPackaging: true,
      }),
      "primary_packaging",
      code,
    );
  }
});

test("extracts and finished goods are not classified from packaging words in the name", () => {
  assert.equal(
    classifyPoLineProductType({
      skuCode: "EXT-TAMANU",
      skuName: "Tamanu extract",
      isPackaging: false,
      isExtract: true,
    }),
    "extract",
  );
  assert.equal(
    classifyPoLineProductType({
      skuCode: "FSE-MGT-BRIGHTENINGSERUM-15ML",
      skuName: "Mangosteen Brightening Serum 15ml bottle",
      isPackaging: false,
      isExtract: false,
    }),
    "mixing_filling",
  );
});

test("merch packs and eflute lines stay secondary even when the name mentions the formula", () => {
  assert.equal(
    classifyPoLineProductType({
      skuCode: "MER-LOVEGIFTBOX",
      skuName: "MER-LOVEGIFTBOX",
      isPackaging: true,
    }),
    "secondary_packaging",
  );
  assert.equal(
    classifyPoLineProductType({
      skuCode: "MER-SLEEVERAMADHAN-MOONLIGHTWHITE",
      skuName: "MER-SLEEVERAMADHAN-MOONLIGHTWHITE",
      isPackaging: true,
    }),
    "secondary_packaging",
  );
  assert.equal(
    classifyPoLineProductType({
      skuCode: "FCR-PRF-PLUMPINGCREAM-15ML-V2-EFLUTE",
      skuName: "PAPUA RED FRUIT PUMPING CREAM (15 ML) - EFLUTE",
      isPackaging: true,
    }),
    "secondary_packaging",
  );
});

test("unknown SKUs fall back to the component in the code", () => {
  assert.equal(
    packagingTypeFromSku("FCR-PRF-PLUMPINGCREAM-30ML-UB", null),
    "secondary_packaging",
  );
  assert.equal(
    classifyPoLineProductType({
      skuCode: "FSE-TMN-ACNEDEFENSESERUM-25ML",
      skuName: "Tamanu Acne Defense Serum",
    }),
    "mixing_filling",
  );
});
