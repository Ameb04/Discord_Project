from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("messaging", "0003_alter_scheduledmessage_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="scheduledmessage",
            name="dispatched_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="scheduledmessage",
            index=models.Index(
                fields=["status", "scheduled_at"],
                name="scheduled_msg_due_idx",
            ),
        ),
    ]
