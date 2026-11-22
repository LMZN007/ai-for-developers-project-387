import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Group,
  NumberInput,
  Stack,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { Link, useNavigate } from "react-router";
import { api } from "../../api.ts";
import {
  isEventTypeField,
  validateEventType,
  type EventTypeFormValues,
  type FieldErrors,
} from "../../eventTypeRules.ts";
import type { CreatedState } from "./EventTypesPage.tsx";

const initialValues: EventTypeFormValues = {
  title: "",
  slug: "",
  description: "",
  durationMinutes: 30,
};

export default function NewEventTypePage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const change = <Field extends keyof EventTypeFormValues>(
    field: Field,
    value: EventTypeFormValues[Field],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailed(false);

    const found = validateEventType(values);
    setErrors(found);
    if (Object.keys(found).length > 0 || typeof values.durationMinutes !== "number") {
      return;
    }

    const description = values.description.trim();
    setSubmitting(true);
    try {
      const { data, error } = await api.POST("/event-types", {
        body: {
          title: values.title.trim(),
          slug: values.slug,
          ...(description ? { description } : {}),
          durationMinutes: values.durationMinutes,
        },
      });

      if (data) {
        const state: CreatedState = { createdTitle: data.title };
        await navigate("/admin/event-types", { state });
        return;
      }
      if (error?.code === "slug_taken") {
        setErrors({ slug: "Эта ссылка уже занята" });
      } else if (error?.code === "validation_error" && error.fields?.length) {
        const serverErrors: FieldErrors = {};
        for (const { field, message } of error.fields) {
          if (isEventTypeField(field)) {
            serverErrors[field] = message;
          }
        }
        setErrors(serverErrors);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
    setSubmitting(false);
  };

  return (
    <>
      <Title order={1}>Новый тип встречи</Title>

      {failed && (
        <Alert color="red" mt="lg" title="Не удалось сохранить тип встречи">
          Попробуйте ещё раз.
        </Alert>
      )}

      <form onSubmit={submit} noValidate>
        <Stack mt="lg" maw={480}>
          <TextInput
            label="Название"
            placeholder="Консультация"
            required
            value={values.title}
            onChange={(event) => change("title", event.currentTarget.value)}
            error={errors.title}
          />
          <TextInput
            label="Ссылка (slug)"
            description="Строчные латинские буквы, цифры и дефисы"
            placeholder="consultation"
            leftSection="/book/"
            leftSectionWidth={56}
            required
            value={values.slug}
            onChange={(event) => change("slug", event.currentTarget.value)}
            error={errors.slug}
          />
          <Textarea
            label="Описание"
            autosize
            minRows={3}
            value={values.description}
            onChange={(event) => change("description", event.currentTarget.value)}
            error={errors.description}
          />
          <NumberInput
            label="Длительность, минут"
            required
            min={15}
            max={240}
            step={15}
            allowDecimal={false}
            allowNegative={false}
            value={values.durationMinutes}
            onChange={(value) => change("durationMinutes", value)}
            error={errors.durationMinutes}
          />
          <Group mt="sm">
            <Button type="submit" loading={submitting}>
              Сохранить
            </Button>
            <Button component={Link} to="/admin/event-types" variant="default">
              Отмена
            </Button>
          </Group>
        </Stack>
      </form>
    </>
  );
}
