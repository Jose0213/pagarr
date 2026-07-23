import type { FieldSelectOption } from "../../languages/fieldSelectOption.js";
import type { NewznabCategory } from "./NewznabCapabilities.js";

// Ignore categories not relevant for Readarr
const IGNORE_CATEGORIES: readonly number[] = [1000, 2000, 4000, 5000, 6000];

// And maybe relevant for specific users
const UNIMPORTANT_CATEGORIES: readonly number[] = [0, 8000];

/** Ported from NzbDrone.Core/Indexers/Newznab/NewznabCategoryFieldOptionsConverter.cs. */
export function getFieldSelectOptions(
  categoriesInput: NewznabCategory[] | null
): FieldSelectOption[] {
  let categories = categoriesInput;

  if (categories === null) {
    // Fetching categories failed, use default Newznab categories
    categories = [
      {
        id: 3000,
        name: "Audio",
        description: "",
        subcategories: [{ id: 3030, name: "Audiobook", description: "", subcategories: [] }],
      },
      {
        id: 7000,
        name: "Books",
        description: "",
        subcategories: [
          { id: 7010, name: "Misc books", description: "", subcategories: [] },
          { id: 7020, name: "Ebook", description: "", subcategories: [] },
          { id: 7030, name: "Comics", description: "", subcategories: [] },
          { id: 7040, name: "Magazines", description: "", subcategories: [] },
        ],
      },
    ];
  }

  const result: FieldSelectOption[] = [];

  const ordered = categories
    .filter((cat) => !IGNORE_CATEGORIES.includes(cat.id))
    .sort((a, b) => {
      const unimportantA = UNIMPORTANT_CATEGORIES.includes(a.id) ? 1 : 0;
      const unimportantB = UNIMPORTANT_CATEGORIES.includes(b.id) ? 1 : 0;
      if (unimportantA !== unimportantB) {
        return unimportantA - unimportantB;
      }
      return a.id - b.id;
    });

  for (const category of ordered) {
    result.push({
      value: category.id,
      name: category.name,
      hint: `(${category.id})`,
    });

    if (category.subcategories) {
      const subcats = [...category.subcategories].sort((a, b) => a.id - b.id);
      for (const subcat of subcats) {
        result.push({
          value: subcat.id,
          name: subcat.name,
          hint: `(${subcat.id})`,
          parentValue: category.id,
        });
      }
    }
  }

  return result;
}
