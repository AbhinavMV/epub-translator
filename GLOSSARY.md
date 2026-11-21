# epub-translator

Translates EPUB books, mostly Japanese light novels, into another language chapter by chapter with an LLM, keeping the reader in control of terms and style.

## Language

### Library

**Project**:
One work published as a sequence of volumes, such as a single light novel series. Every book belongs to exactly one project; a one-off book is a project with one volume.
_Avoid_: Series, collection, group

**Book**:
One imported EPUB file, which is one volume of a project.
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
The project's free-text style instructions, applied when translating any of its books.
_Avoid_: Instructions, style guide
