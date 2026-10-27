-- AlterTable
ALTER TABLE "User" ADD COLUMN     "signupCountry" TEXT,
ADD COLUMN     "signupReferrer" TEXT,
ADD COLUMN     "signupUtmCampaign" TEXT,
ADD COLUMN     "signupUtmMedium" TEXT,
ADD COLUMN     "signupUtmSource" TEXT;
