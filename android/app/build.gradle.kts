plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "ru.apukhtin.budget"
    compileSdk = 36

    defaultConfig {
        applicationId = "ru.apukhtin.budget"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.all {
            // The screens of the server's API that make android-check writes from demo data (see check.sh).
            it.systemProperty("fixtures", providers.gradleProperty("fixtures").getOrElse(""))
        }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.icons)
    implementation(libs.compose.tooling.preview)
    debugImplementation(libs.compose.tooling)
    implementation(libs.activity.compose)
    implementation(libs.core.ktx)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.glance)
    testImplementation(libs.junit)
}
