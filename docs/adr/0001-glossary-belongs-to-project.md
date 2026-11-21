# The glossary belongs to the project, not the book

Light novels are translated volume by volume, and names and terms must render the same way across every volume. So the glossary and custom prompt live on the project, every book belongs to exactly one project (a one-off book is a one-volume project), and books keep only their provider and model. A book has no glossary of its own and cannot override a project term.

## Considered Options

- **Layered glossaries** (project terms plus per-book additions or overrides) were rejected: they bring merge rules and "which rendering won?" questions, while a term that matters to only one volume can sit in the project glossary with a note.
- **Optional projects** (standalone books allowed) were rejected so that translation always reads the glossary from one place.

## Consequences

Moving a book between projects carries no terms with it. Merging books into one project, at migration or later, can yield glossary conflicts; the higher volume's rendering stays in force until the reader picks one. Changing a term does not retranslate earlier volumes.
