# ClogX

A pretty log of your montly commits output to a docx file. Handy for reporting your monthly progress to your manager or team.

## Install

```bash
npm install clogx
```

## Usage

### Requirred Arguments

1. `--month` - The month you want to generate the log for. This can either be the full month name, or the first 3 letters of the month name.
2. `--author` - The author of the commits you want to generate the log for. Use either the name listed in the commit, or the email address.

### Optional Arguments

1. `--pdf` - If you want to generate a pdf file instead of a docx file. This requires that you have libreoffice installed on your system.
2. `--fetch` - Makes sure to fetch all the commits from the remote repository before generating the log. This is useful if you have not pulled the latest commits from the remote repository.

## Examples

### Running local installation

```bash
clogx --month=May --author="John Doe"
```

### Running with npx

```bash
npx clogx --month=May --author="John Doe"
```
