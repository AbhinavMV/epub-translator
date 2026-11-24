# epub-translator

Translates EPUB books, mostly Japanese light novels, into another language chapter by chapter with an LLM, keeping the reader in control of terms and style.

## Language

### Library

**Project**:
One work published as a sequence of volumes, such as a single light novel series. Every book belongs to exactly one project; a one-off book is a project with one volume.
_Avoid_: Series, collection, group

**Book**:
One uploaded EPUB file, which is one volume of a project.
_Avoid_: Epub, file

**Volume number**:
A book's position within its project, read from its title where possible and always editable by the reader. It may be fractional (2.5) and two books may share one.
_Avoid_: Index, order

**Series title**:
A book's title with its volume marker removed; books with the same series title belong to the same project.
_Avoid_: Base title, project name

**Owner**:
The user a project and its books belong to; nothing is shared between users.

### Translation

**Glossary**:
The project's list of source terms and the rendering every book in the project must use for them, with an optional note. It has no target language.
_Avoid_: Term list, dictionary

**Glossary entry**:
One source term, its rendering, and an optional note.
_Avoid_: Term

**Glossary conflict**:
A glossary entry for which merged books supplied different renderings; one rendering is in force until the reader picks one.

**Custom prompt**:
The project's free-text style instructions, which take the place of the default style guidance when translating any of its books. The fidelity and format rules always apply and cannot be edited.
_Avoid_: Instructions, style guide

**Translated title**:
The rendering of a book's own title, taken from its English translation. With its volume marker removed, it can become the project's name, but only when the reader chooses to rename the project.

**Fully translated**:
A project in which every volume has a complete translation into the same target language. Flagged segments count as translated; proofreading is not required.

**Main language**:
The target language a project's progress is counted in: the one the most volumes are completely translated into; on a tie, the one the most volumes have any translated passage in; on a further tie, the language listed first among the target languages. A project with no translated passage in any language has none. A volume counts as translated, and its percentage is measured, only in the main language, so a project is fully translated exactly when it has volumes and every one is translated.
_Avoid_: Primary language, default language
