# Certificate Template

Place the file `arena_Certificate.jpg` in this folder.

This is the JPG template used by the certificate generation service to overlay the participant's name, hackathon name, and date using Sharp + SVG.

## Requirements
- File name: `arena_Certificate.jpg`
- Recommended size: 1360×960 px (or similar landscape format)
- The service will overlay text at approximately:
  - **Name**: vertical center (50% height)
  - **Hackathon name**: 60% height
  - **Date**: 68% height

## Usage
The certificate image is generated when `POST /certificate/generate` is called by an authenticated user.
